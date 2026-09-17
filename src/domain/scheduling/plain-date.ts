/**
 * A calendar date without time or timezone. Onboarding deadlines are civil
 * dates ("le 3 mars"), never instants: representing them as a timestamp makes
 * the same deadline land on two different days depending on the reader's
 * timezone. All arithmetic here is done on epoch day numbers, so the domain
 * never touches the ambient `Date`.
 */

declare const plainDateBrand: unique symbol;

export type PlainDate = string & { readonly [plainDateBrand]: true };

export const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export interface CalendarParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days between 1970-01-01 and the given civil date (Howard Hinnant's algorithm). */
function daysFromCivil({ year, month, day }: CalendarParts): number {
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(epochDay: number): CalendarParts {
  const shifted = epochDay + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1;
  const month = monthIndex + (monthIndex < 10 ? 3 : -9);
  return { year: month <= 2 ? year + 1 : year, month, day };
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function format({ year, month, day }: CalendarParts): PlainDate {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as PlainDate;
}

/**
 * Parses an ISO `YYYY-MM-DD` string, rejecting dates that look well-formed but
 * do not exist (2026-02-30, 2025-02-29).
 */
export function parsePlainDate(value: string): PlainDate {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new RangeError(`Invalid date "${value}": expected the ISO format YYYY-MM-DD.`);
  }
  const [, year, month, day] = match;
  const parts: CalendarParts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) {
    throw new RangeError(`Invalid date "${value}": month or day out of range.`);
  }
  const roundTripped = format(civilFromDays(daysFromCivil(parts)));
  if (roundTripped !== value) {
    throw new RangeError(`Invalid date "${value}": this day does not exist.`);
  }
  return roundTripped;
}

export function isValidPlainDate(value: string): boolean {
  try {
    parsePlainDate(value);
    return true;
  } catch {
    return false;
  }
}

export function toEpochDay(date: PlainDate): number {
  return daysFromCivil(toCalendarParts(date));
}

export function fromEpochDay(epochDay: number): PlainDate {
  return format(civilFromDays(epochDay));
}

export function toCalendarParts(date: PlainDate): CalendarParts {
  const match = ISO_DATE.exec(date);
  if (!match) {
    throw new RangeError(`Invalid date "${date}".`);
  }
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

export function addCalendarDays(date: PlainDate, days: number): PlainDate {
  return fromEpochDay(toEpochDay(date) + days);
}

export function weekdayOf(date: PlainDate): Weekday {
  // Epoch day 0 (1970-01-01) was a Thursday, index 4 in WEEKDAYS.
  const index = (((toEpochDay(date) + 4) % 7) + 7) % 7;
  const weekday = WEEKDAYS[index];
  if (!weekday) {
    throw new RangeError(`Unreachable weekday index ${index}.`);
  }
  return weekday;
}

/** The Monday of the week containing `date` (the date itself when it is a Monday). */
export function mondayOf(date: PlainDate): PlainDate {
  const daysSinceMonday = (WEEKDAYS.indexOf(weekdayOf(date)) + 6) % 7;
  return addCalendarDays(date, -daysSinceMonday);
}

/** Negative when `a` is earlier, positive when later, zero when equal. */
export function comparePlainDates(a: PlainDate, b: PlainDate): number {
  return toEpochDay(a) - toEpochDay(b);
}

export function isBefore(a: PlainDate, b: PlainDate): boolean {
  return comparePlainDates(a, b) < 0;
}

export function isAfter(a: PlainDate, b: PlainDate): boolean {
  return comparePlainDates(a, b) > 0;
}

export function differenceInCalendarDays(from: PlainDate, to: PlainDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function minPlainDate(a: PlainDate, b: PlainDate): PlainDate {
  return isBefore(a, b) ? a : b;
}

export function maxPlainDate(a: PlainDate, b: PlainDate): PlainDate {
  return isAfter(a, b) ? a : b;
}
