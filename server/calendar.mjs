const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value))
    throw new TypeError("A data deve usar ISO-8601.");
  return value.slice(0, 10);
}

function utcDate(value) {
  return new Date(`${dateOnly(value)}T00:00:00.000Z`);
}

function format(date) {
  return date.toISOString().slice(0, 10);
}

function plusDays(value, days) {
  const date = utcDate(value);
  date.setTime(date.getTime() + days * DAY_MS);
  return format(date);
}

function workingDay(value, calendar) {
  const weekday = utcDate(value).getUTCDay();
  const holidays = new Set(calendar.holidays || []);
  return (calendar.workingWeekdays || [1, 2, 3, 4, 5]).includes(weekday) &&
    !holidays.has(value);
}

export function addWorkingDuration(startAt, durationDays, calendar) {
  if (!Number.isFinite(durationDays) || durationDays < 0)
    throw new TypeError("A duração deve ser um número não negativo.");
  durationDays = Math.ceil(durationDays);
  const start = dateOnly(startAt);
  if (durationDays === 0) return start;
  if (calendar?.kind === "elapsed_days") return plusDays(start, durationDays - 1);
  let current = start;
  let counted = 0;
  while (counted < durationDays) {
    if (workingDay(current, calendar || {})) counted++;
    if (counted < durationDays) current = plusDays(current, 1);
  }
  return current;
}

export function nextCalendarDay(value, calendar) {
  let current = plusDays(value, 1);
  if (calendar?.kind === "elapsed_days") return current;
  while (!workingDay(current, calendar || {})) current = plusDays(current, 1);
  return current;
}

export function addCalendarLag(finishAt, lagDays, calendar) {
  if (!Number.isFinite(lagDays) || lagDays < 0)
    throw new TypeError("A defasagem deve ser um número não negativo.");
  lagDays = Math.ceil(lagDays);
  if (lagDays === 0) return nextCalendarDay(finishAt, calendar);
  return addWorkingDuration(nextCalendarDay(finishAt, calendar), lagDays, calendar);
}

export function countCalendarDays(startAt, endAt, calendar) {
  const start = dateOnly(startAt);
  const end = dateOnly(endAt);
  if (end < start) return 0;
  if (calendar?.kind === "elapsed_days")
    return Math.floor((utcDate(end).getTime() - utcDate(start).getTime()) / DAY_MS) + 1;
  let current = start;
  let counted = 0;
  while (current <= end) {
    if (workingDay(current, calendar || {})) counted++;
    current = plusDays(current, 1);
  }
  return counted;
}
