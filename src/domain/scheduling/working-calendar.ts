import {
  addCalendarDays,
  comparePlainDates,
  isAfter,
  type PlainDate,
  type Weekday,
  WEEKDAYS,
  weekdayOf,
} from './plain-date';

/**
 * Which days a company actually works, for one site. Both the weekend and the
 * public holidays are data: a subsidiary whose weekend is Friday/Saturday, or a
 * site with regional holidays, is a row in the database, never a branch here.
 */
export interface WorkingCalendar {
  readonly weekend: ReadonlySet<Weekday>;
  readonly holidays: ReadonlySet<PlainDate>;
}

export interface WorkingCalendarInput {
  readonly weekend?: readonly Weekday[];
  readonly holidays?: readonly PlainDate[];
}

export const DEFAULT_WEEKEND: readonly Weekday[] = ['saturday', 'sunday'];

/** Bound on the search for a working day, so a misconfigured calendar fails loudly. */
const MAX_SEARCH_DAYS = 366;

export function createWorkingCalendar(input: WorkingCalendarInput = {}): WorkingCalendar {
  const weekend = new Set(input.weekend ?? DEFAULT_WEEKEND);
  if (weekend.size >= WEEKDAYS.length) {
    throw new RangeError('A working calendar cannot declare every weekday as weekend.');
  }
  return { weekend, holidays: new Set(input.holidays ?? []) };
}

/**
 * A site inherits its company holidays and adds its own; the union is what the
 * site actually observes.
 */
export function mergeHolidays(
  ...holidaySets: ReadonlyArray<readonly PlainDate[]>
): readonly PlainDate[] {
  const merged = new Set<PlainDate>();
  for (const holidays of holidaySets) {
    for (const holiday of holidays) {
      merged.add(holiday);
    }
  }
  return [...merged].sort(comparePlainDates);
}

export function isWeekend(date: PlainDate, calendar: WorkingCalendar): boolean {
  return calendar.weekend.has(weekdayOf(date));
}

export function isHoliday(date: PlainDate, calendar: WorkingCalendar): boolean {
  return calendar.holidays.has(date);
}

export function isWorkingDay(date: PlainDate, calendar: WorkingCalendar): boolean {
  return !isWeekend(date, calendar) && !isHoliday(date, calendar);
}

export type ShiftDirection = 'forward' | 'backward';

/** Returns `date` itself when it is worked, otherwise the nearest working day. */
export function shiftToWorkingDay(
  date: PlainDate,
  calendar: WorkingCalendar,
  direction: ShiftDirection = 'forward',
): PlainDate {
  const step = direction === 'forward' ? 1 : -1;
  let candidate = date;
  for (let i = 0; i <= MAX_SEARCH_DAYS; i += 1) {
    if (isWorkingDay(candidate, calendar)) {
      return candidate;
    }
    candidate = addCalendarDays(candidate, step);
  }
  throw new RangeError(`No working day found within ${MAX_SEARCH_DAYS} days of ${date}.`);
}

export function nextWorkingDay(date: PlainDate, calendar: WorkingCalendar): PlainDate {
  return shiftToWorkingDay(addCalendarDays(date, 1), calendar, 'forward');
}

export function previousWorkingDay(date: PlainDate, calendar: WorkingCalendar): PlainDate {
  return shiftToWorkingDay(addCalendarDays(date, -1), calendar, 'backward');
}

/**
 * Moves `count` working days from `date`. A count of zero normalises to the
 * nearest working day, which keeps the operation reversible:
 * `addWorkingDays(addWorkingDays(d, n), -n) === d` for any worked `d`.
 */
export function addWorkingDays(
  date: PlainDate,
  count: number,
  calendar: WorkingCalendar,
): PlainDate {
  if (!Number.isInteger(count)) {
    throw new RangeError(`A working-day offset must be a whole number, received ${count}.`);
  }
  if (count === 0) {
    return shiftToWorkingDay(date, calendar, 'forward');
  }
  const direction: ShiftDirection = count > 0 ? 'forward' : 'backward';
  let current = shiftToWorkingDay(date, calendar, direction);
  for (let moved = 0; moved < Math.abs(count); moved += 1) {
    current = direction === 'forward'
      ? nextWorkingDay(current, calendar)
      : previousWorkingDay(current, calendar);
  }
  return current;
}

/**
 * Number of working days separating two dates, counted the way
 * `addWorkingDays` moves: `from` excluded, `to` included. Negative when `to`
 * precedes `from`, which is what lets a deadline express how late it is.
 */
export function countWorkingDaysBetween(
  from: PlainDate,
  to: PlainDate,
  calendar: WorkingCalendar,
): number {
  if (comparePlainDates(from, to) === 0) {
    return 0;
  }
  const forward = isAfter(to, from);
  const [start, end] = forward ? [from, to] : [to, from];
  let count = 0;
  let cursor = addCalendarDays(start, 1);
  while (comparePlainDates(cursor, end) <= 0) {
    if (isWorkingDay(cursor, calendar)) {
      count += 1;
    }
    cursor = addCalendarDays(cursor, 1);
  }
  return forward ? count : -count;
}
